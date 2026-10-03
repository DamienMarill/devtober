import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { MATOMO } from '../environments/matomo';

type MatomoCommand = (string | number | null)[];

declare global {
  interface Window {
    _paq?: MatomoCommand[];
  }
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Suivi Matomo. Le site est une SPA : la page n'est jamais rechargée, donc chaque navigation
 * doit être envoyée à la main. Les changements de query params seuls (ex. `?track=` du Jour 1)
 * ne comptent pas comme une nouvelle page vue.
 */
@Injectable({ providedIn: 'root' })
export class Analytics {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  init(): void {
    const { url, siteId } = MATOMO;
    const { hostname } = this.document.location;
    if (!url || !siteId) return;
    if (LOCAL_HOSTS.includes(hostname)) return;

    const paq = (window._paq ??= []);
    paq.push(['setTrackerUrl', `${url}matomo.php`], ['setSiteId', siteId]);
    paq.push(['enableLinkTracking']);

    const script = this.document.createElement('script');
    script.async = true;
    script.src = `${url}matomo.js`;
    this.document.head.appendChild(script);

    let lastPath: string | null = null;
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (path === lastPath || path.startsWith('/capture/')) return;
        lastPath = path;
        // Laisse Angular poser le titre de la route avant de l'envoyer.
        setTimeout(() => {
          paq.push(['setCustomUrl', this.document.location.href]);
          paq.push(['setDocumentTitle', this.document.title]);
          paq.push(['trackPageView']);
        });
      });
  }
}
