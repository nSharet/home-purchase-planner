import * as calculator from './calculator.js';

window.calculator = calculator;

for (const source of ['./app-core.js', './app-ui.js']) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${source}`));
    document.head.appendChild(script);
  });
}
