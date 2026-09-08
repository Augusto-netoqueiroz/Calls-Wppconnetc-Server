(() => {
  const originPattern = /(ctwa|ads|campaign|entry|referral|source|origin|template|biz|meta)/i;

  const unwrap = value => {
    if (value && typeof value === 'object' && 'value' in value) return value.value;
    return value;
  };

  const summarize = message => {
    const output = {};
    const queue = [{ prefix: '', value: message }];

    while (queue.length) {
      const current = queue.shift();
      if (!current.value || typeof current.value !== 'object') continue;

      for (const key of Reflect.ownKeys(current.value).map(String)) {
        const path = current.prefix ? current.prefix + '.' + key : key;
        let value;

        try {
          value = unwrap(current.value[key]);
        } catch (_) {
          continue;
        }

        if (originPattern.test(path)) {
          output[path] = value && typeof value === 'object'
            ? Object.keys(value).slice(0, 30)
            : value;
        }

        if (
          current.prefix.split('.').length < 2 &&
          value &&
          typeof value === 'object'
        ) {
          queue.push({ prefix: path, value });
        }
      }
    }

    return output;
  };

  window.inspectWppMessageOrigin = summarize;
  console.log('Use inspectWppMessageOrigin(mensagem) em uma mensagem de laboratório.');
  return summarize;
})();
