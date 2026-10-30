import { z } from 'zod';

/**
 * A web link: http(s) only. `z.url()` alone accepts any scheme, including `javascript:` and `data:`,
 * which become stored XSS the moment a frontend renders the value as a link or image source.
 */
export const httpUrl = (message = 'Enter a valid link, starting with https://') =>
  z.url({ protocol: /^https?$/, message }).max(2048, 'This link is too long');
