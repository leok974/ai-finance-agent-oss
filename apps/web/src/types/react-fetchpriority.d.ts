import 'react';

declare module 'react' {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  interface ImgHTMLAttributes<T> {
    fetchpriority?: 'high' | 'low' | 'auto';
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}
