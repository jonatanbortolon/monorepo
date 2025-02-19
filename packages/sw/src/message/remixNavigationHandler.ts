import type { RemixCache } from '@remix-pwa/cache';
import { Storage } from '@remix-pwa/cache';

import { logger } from '../private/logger.js';
import type { MessageHandlerParams } from './message.js';
import { MessageHandler } from './message.js';

export interface RemixNavigationHandlerOptions extends MessageHandlerParams {
  dataCache: string | RemixCache;
  documentCache: string | RemixCache;
}

export class RemixNavigationHandler extends MessageHandler {
  dataCacheName: string | RemixCache;
  documentCacheName: string | RemixCache;

  constructor({ dataCache, documentCache, plugins, state }: RemixNavigationHandlerOptions) {
    super({ plugins, state });

    this.dataCacheName = dataCache;
    this.documentCacheName = documentCache;
    this._handleMessage = this._handleMessage.bind(this);
  }

  override async _handleMessage(event: ExtendableMessageEvent): Promise<void> {
    const { data } = event;
    let dataCache: RemixCache | string, documentCache: RemixCache | string;

    dataCache = this.dataCacheName;
    documentCache = this.documentCacheName;

    this.runPlugins('messageDidReceive', {
      event,
    });

    const cachePromises: Map<string, Promise<void>> = new Map();

    if (data.type === 'REMIX_NAVIGATION') {
      const { isMount, location, manifest, matches } = data;
      const documentUrl = location.pathname + location.search + location.hash;

      if (typeof dataCache === 'string') {
        dataCache = Storage.open(dataCache);
      }

      if (typeof documentCache === 'string') {
        documentCache = Storage.open(documentCache);
      }

      const existingDocument = await Storage._match(documentUrl);

      if (!existingDocument || !isMount) {
        const response = await fetch(documentUrl);

        cachePromises.set(
          documentUrl,
          documentCache.put(documentUrl, response).catch(error => {
            logger.error(`Failed to cache document for ${documentUrl}:`, error);
          })
        );
      }

      if (isMount) {
        for (const match of matches) {
          if (manifest.routes[match.id].hasLoader) {
            const params = new URLSearchParams(location.search);
            params.set('_data', match.id);

            let search = params.toString();
            search = search ? `?${search}` : '';

            const url = location.pathname + search + location.hash;

            if (!cachePromises.has(url)) {
              logger.debug('Caching data for:', url);

              const response = await fetch(url);

              cachePromises.set(
                url,
                dataCache.put(url, response).catch(error => {
                  logger.error(`Failed to cache data for ${url}:`, error);
                })
              );
            }
          }
        }
      }
    }

    await Promise.all(cachePromises.values());
  }
}
