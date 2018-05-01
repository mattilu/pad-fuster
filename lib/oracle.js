const request = require('request');
const { encode, urlEncode } = require('./utils');


function makeReplacer(original, sample) {
  const index = original.indexOf(sample);
  if (index === -1) {
    return null;
  }

  const pre = original.substring(0, index);
  const post = original.substring(index + sample.length);
  return payload => `${pre}${payload}${post}`;
}

class HttpOracle {
  constructor(args) {
    this.url = args.url;
    this.body = args.data;
    this.encoding = args.encoding;
    this.retryCount = args.retryCount || 3;

    const cookies = args.cookies;
    const sample = args.sample;

    this.buildUrl = makeReplacer(this.url, sample);
    if (this.body) {
      this.buildBody = makeReplacer(this.body, sample);
      this.method = args.method || 'POST';
    } else {
      this.method = args.method || 'GET';
    }

    let found = this.buildUrl || this.buildBody;
    if (cookies && cookies.length > 0) {
      let foundCookie = false;
      const builders = cookies.map((cookie) => {
        const index = cookie.indexOf('=');
        if (index === -1) {
          return { cookie };
        }

        const key = cookie.substring(0, index);
        const value = cookie.substring(index + 1);
        const replacer = makeReplacer(value, sample);
        if (!replacer) {
          return { cookie };
        }

        foundCookie = true;
        return {
          build: payload => `${key}=${replacer(payload)}`,
        };
      });

      this.buildCookies = (payload, url) => {
        const jar = request.jar();
        builders.forEach((builder) => {
          const cookie = builder.cookie || builder.build(payload);
          jar.setCookie(cookie, url);
        });
        return jar;
      };

      if (foundCookie) {
        found = true;
      }
    }

    if (!found) {
      throw new Error('Sample not found in either URL, POST data or Cookies');
    }
  }

  test(probe, callback) {
    const self = this;
    const payload = encode(probe.payload, this.encoding);

    let retry = this.retryCount;
    function handler(err, res, body) {
      if (err) {
        retry -= 1;
        if (retry === 0) {
          callback(err);
        } else {
          self.request(probe.payload, handler);
        }
      } else {
        const code = res.statusCode;
        const message = res.statusMessage;
        const length = body.length;
        const debugData = `Payload: ${payload} | ${code} ${message} (${length}B)`;
        const result = self.testResponse(res, body);

        callback(null, {
          probe,
          debugData,
          result,
        });
      }
    }

    this.request(payload, handler);
  }

  // eslint-disable-next-line class-methods-use-this
  testResponse(res) {
    return res.statusCode === 200;
  }

  request(payload, callback) {
    const urlEncodedPayload = urlEncode(payload);
    const url = this.buildUrl ? this.buildUrl(urlEncodedPayload) : this.url;
    const method = this.method;
    const body = this.buildBody ? this.buildBody(payload) : this.body;
    const cookies = this.buildCookies ? this.buildCookies(urlEncodedPayload, url) : null;

    const args = {
      url,
      method,
    };
    if (body) {
      args.body = body;
    }
    if (cookies) {
      args.jar = cookies;
    }

    request(args, callback);
  }
}

module.exports = {
  HttpOracle,
};
