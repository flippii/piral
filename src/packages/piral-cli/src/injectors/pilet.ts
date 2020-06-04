import { join } from 'path';
import { EventEmitter } from 'events';
import { readFileSync, existsSync, statSync } from 'fs';
import { KrasInjector, KrasResponse, KrasRequest, KrasInjectorConfig } from 'kras';
import { mime } from '../external';
import { Bundler } from '../types';

export interface PiletInjectorConfig extends KrasInjectorConfig {
  bundler: Bundler;
  root: string;
  api: string;
  app: string;
}

export default class PiletInjector implements KrasInjector {
  public config: PiletInjectorConfig;
  private requireRef?: string;

  constructor(options: PiletInjectorConfig, _: any, core: EventEmitter) {
    this.config = options;
    const { bundler, api } = options;
    const cbs = {};

    core.on('user-connected', e => {
      if (e.target === '*' && e.url === api.substr(1)) {
        cbs[e.id] = (msg: string) => e.ws.send(msg);
      }
    });

    core.on('user-disconnected', e => {
      delete cbs[e.id];
    });

    bundler.on(({ requireRef, version }) => {
      this.requireRef = version === 'v1' ? requireRef : undefined;
      const meta = this.getMeta();

      for (const id of Object.keys(cbs)) {
        cbs[id](meta);
      }
    });
  }

  get active() {
    return this.config.active;
  }
  set active(value) {
    this.config.active = value;
  }

  get name() {
    return 'pilet-injector';
  }

  getOptions() {
    return {};
  }

  setOptions() {}

  getMeta() {
    const { bundler, root, api } = this.config;
    const def = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const file = bundler.bundle.name.replace(/^\//, '');
    return JSON.stringify({
      name: def.name,
      version: def.version,
      link: `${api}/${file}`,
      hash: bundler.bundle.hash,
      requireRef: this.requireRef,
      noCache: true,
      custom: def.custom,
    });
  }

  sendContent(content: Buffer | string, type: string, url: string): KrasResponse {
    return {
      injector: { name: this.name },
      headers: {
        'content-type': type,
        'cache-control': 'no-cache, no-store, must-revalidate',
        pragma: 'no-cache',
        expires: '0',
      },
      status: { code: 200 },
      url,
      content,
    };
  }

  sendFile(target: string, url: string): KrasResponse {
    const content = readFileSync(target);
    return this.sendContent(content, mime.getType(target), url);
  }

  sendResponse(path: string, target: string, url: string): KrasResponse {
    if (!path) {
      const content = this.getMeta();
      return this.sendContent(content, 'application/json', url);
    } else if (existsSync(target) && statSync(target).isFile()) {
      return this.sendFile(target, url);
    }
  }

  handle(req: KrasRequest): KrasResponse {
    const { bundler, app, api } = this.config;
    const path = req.url.substr(1).split('?')[0];

    if (!req.target) {
      const target = join(app, path);

      if (existsSync(target) && statSync(target).isFile()) {
        return this.sendFile(target, req.url);
      } else {
        return this.handle({
          ...req,
          url: '/index.html',
        });
      }
    } else if (req.target === api) {
      const target = join(bundler.bundle.dir, path);
      return bundler.ready().then(() => this.sendResponse(path, target, req.url));
    }
  }
}
