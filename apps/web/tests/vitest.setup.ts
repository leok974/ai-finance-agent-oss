import '@testing-library/jest-dom';

// minimal visualViewport poly
Object.defineProperty(window, 'visualViewport', {
  writable: true,
  value: {
    width: 1280,
    height: 720,
    offsetLeft: 0,
    offsetTop: 0,
    addEventListener() {},
    removeEventListener() {},
  },
});
