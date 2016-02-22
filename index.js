/**
 * Module dependencies
 */

var Counter = require('reference-count');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var debounce = require('debounce');
var Context = require('./lib/context');

/**
 * Expose CanaryStore
 */

module.exports = CanaryStore;

function noop() {}

/**
 * Create a CanaryStore
 */

function CanaryStore() {
  var self = this;
  EventEmitter.call(self);
  var counter = self._counter = new Counter();
  counter.on('resource', self._onresource.bind(self));

  self._id = 0;
  self._variants = {};
  self._callbacks = {};
  self._assigners = [];
  self._assignments = {};
  self._overrides = {};
  self._pending = 0;

  // create a global context for simple cases
  var context = this._globalContext = this.context(this.emit.bind(this, 'change'));
  this.get = context.get.bind(context);
  this.start = context.start.bind(context);
  this.stop = context.stop.bind(context);
}
inherits(CanaryStore, EventEmitter);

/**
 * Create a child context
 *
 * @param {Function} fn
 * @return {Context}
 */

CanaryStore.prototype.context = function(fn) {
  var counter = this._counter;
  var id = this._id++;

  this._callbacks[id] = debounce(fn, 10);

  var sweep = counter.sweep.bind(counter, id);
  var destroy = counter.destroy.bind(counter, id);

  return new Context(sweep, this, destroy);
};

/**
 * Setup a feature
 *
 * @param {String} feature
 * @param {Array} variants
 * @return {CanaryStore}
 * @api public
 */

CanaryStore.prototype.config = function(feature, variants) {
  if (typeof variants === 'function') {
    this.assign(function(n, v, cb) {
      if (n === feature) return variants(cb);
      cb('next');
    });
  } else {
    this._variants[feature] = variants || [false, true];
  }
  return this;
};

/**
 * Assign a variant to a feature
 *
 * @param {String} feature
 * @param {Any} variant
 * @return {CanaryStore}
 * @api public
 */

CanaryStore.prototype.assign = function(feature, variant) {
  typeof feature === 'function' ?
    this._assigners.push(feature) :
    this._assign(feature, variant, this._assignments);

  return this;
};

/**
 * Override an assigned value
 *
 * @param {String} feature
 * @param {Any} variant
 * @return {CanaryStore}
 * @api public
 */

CanaryStore.prototype.override = function(feature, variant) {
  this._assign(feature, variant, this._overrides);
  return this;
};

/**
 * Reset overrides to assigned values
 *
 * @return {CanaryStore}
 * @api public
 */

CanaryStore.prototype.reset = function() {
  var self = this;
  var overrides = self._overrides;
  var assignments = self._assignments;
  self._overrides = {};
  for (var k in overrides) {
    self._assign(k, assignments[k], assignments);
  }
  self._done();
  return self;
};

/**
 * List all of the feature configurations
 *
 * @return {Array}
 * @api public
 */

CanaryStore.prototype.features = function() {
  var self = this;
  var variants = self._variants;
  var assignments = self._assignments;
  var overrides = self._overrides;

  return Object.keys(variants).map(function(feature) {
    var selected = self._fetch(feature);
    return {
      name: feature,
      variants: variants[feature].map(function(variant) {
        return {
          value: variant,
          selected: selected === variant
        };
      }),
      assignment: assignments[feature],
      hasAssignment: typeof assignments[feature] !== 'undefined',
      override: overrides[feature],
      hasOverride: typeof overrides[feature] !== 'undefined',
      set: self.override.bind(self, feature)
    };
  });
};

CanaryStore.prototype._fetch = function(feature, fallback) {
  var override = this._overrides[feature];
  if (typeof override !== 'undefined') return override;
  var variant = this._assignments[feature];
  if (typeof variant !== 'undefined') return variant;
  return fallback;
};

CanaryStore.prototype._onresource = function(feature) {
  var self = this;
  var assignments = self._assignments;

  if (typeof assignments[feature] !== 'undefined') return this._done();

  var variants = self._variants[feature];

  self._pending++;
  clearTimeout(self._timeout);
  self._select(feature, variants, 0, function(err, variant) {
    // TODO what to do with errors
    self._pending--;
    self._assign(feature, variant, assignments);
    self._done();
  });
};

CanaryStore.prototype._select = function(feature, variants, i, cb) {
  var self = this;
  var assigners = self._assigners;

  if (i === assigners.length) return cb(null, variants[0]);

  assigners[i](feature, variants, function(err, variant) {
    if (err === 'next') return self._select(feature, variants, i + 1, cb);
    cb(err, variant);
  });
};

CanaryStore.prototype._assign = function(feature, variant, assignments) {
  var self = this;
  assignments[feature] = variant;
  var actors = self._counter.actors;

  for (var actor in actors) {
    actors[actor][feature] && self._callbacks[actor]();
  }

  this.emit('change', feature, variant);
};

CanaryStore.prototype._done = function() {
  var self = this;
  clearTimeout(self._timeout);

  self._timeout = setTimeout(function() {
    if (self._pending === 0) self.emit('complete');
  }, 50);
};
