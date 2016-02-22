var should = require('should');
var Store = require('..');

describe('canary-store', function() {
  var store;
  beforeEach(function() {
    store = new Store();
  });

  it('should assign a static variant', function() {
    store
      .config('feature-1', ['red', 'blue', 'green'])
      .assign('feature-1', 'red');

    var res = createContext(store, function(get) {
      return get('feature-1');
    });

    res.value.should.eql('red');
  });

  it('should assign a dynamic variant', function(done) {
    var selected;

    store
      .config('feature-1', ['red', 'blue', 'green'])
      .assign(function(feature, variants, cb) {
        selected = variants[Math.floor(Math.random() * variants.length)]
        cb(null, selected);
      });

    store.on('complete', function() {
      res.value.should.eql(selected);
      done();
    });

    var res = createContext(store, function(get) {
      return get('feature-1');
    });
  });

  it('should override an already assigned variant', function(done) {
    store
      .config('feature-1', ['red', 'blue', 'green'])
      .assign('feature-1', 'red');

    store.on('complete', function() {
      res.value.should.eql('red');
      store.override('feature-1', 'blue');
      setTimeout(function() {
        res.value.should.eql('blue');
        done();
      }, 10);
    });

    var res = createContext(store, function(get) {
      return get('feature-1');
    });
  });

  it('should list the configured features', function(done) {
    store
      .config('feature-1', ['red', 'blue', 'green'])
      .config('feature-2')
      .config('feature-3', ['foo', 'bar']);

    store.on('complete', function() {
      var features = store.features();
      features.length.should.eql(3)
      features[0].name.should.eql('feature-1');
      features[1].name.should.eql('feature-2');
      features[2].name.should.eql('feature-3');
      done();
    });

    createContext(store, function(get) {
      return ['feature-1', 'feature-2', 'feature-3'].map(get);
    });
  });
});

function createContext(store, render) {
  var res = {
    times: 0
  };

  var context = store.context(exec);

  function exec() {
    context.start();
    var out = res.value = render(context.get, context);
    res.times++;
    context.stop();
    return out;
  }

  exec();

  return res;
}
