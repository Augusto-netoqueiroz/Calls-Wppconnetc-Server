(() => {
  const result = {
    checkedAt: new Date().toISOString(),
    globals: {},
    callApi: [],
    callStore: null,
    webpack: null
  };

  for (const name of ['WPP', 'Store', '__webpackRequireWpp']) {
    result.globals[name] = typeof window[name];
  }

  if (window.WPP && window.WPP.call) {
    result.callApi = Reflect.ownKeys(window.WPP.call)
      .map(String)
      .sort();
  }

  const store = window.Store;
  const candidate = store && (store.CallStore || store.Call || store.Calls);
  if (candidate) {
    result.callStore = {
      keys: Reflect.ownKeys(candidate).map(String).slice(0, 100),
      hasActiveCall: 'activeCall' in candidate
    };
  }

  const chunkName = Object.getOwnPropertyNames(window)
    .find(name => /^webpackChunkwhatsapp_web_client$/.test(name));

  result.webpack = chunkName || null;
  console.table(result.globals);
  console.log(result);
  return result;
})();
