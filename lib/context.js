module.exports = Context;

function Context(start, store, destroy) {
  this._start = start;
  this._store = store;
  this.destroy = destroy;
  this.get = this.get.bind(this);
}

Context.prototype.get = function(feature, variants, fallback) {
  if (!Array.isArray(variants)) {
    fallback = variants;
    variants = null
  }

  if (variants && !store._variants[feature]) store._variants[feature] = variants;

  this._sweep.count(feature);
  return this._store._fetch(feature, fallback);
};

Context.prototype.start = function() {
  return this._sweep = this._start();
};

Context.prototype.stop = function() {
  this._sweep.done();
  delete this._sweep;
};
