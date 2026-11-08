/** This site's address without the #/... part. */
export const siteUrl = () => window.location.href.split('#')[0]!;
export const qrTarget = (base: string, routeId: string) =>
  `${(base || siteUrl()).replace(/#.*$/, '')}#/r/${routeId}`;
