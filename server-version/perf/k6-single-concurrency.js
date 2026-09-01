import { runFinalSubmit } from './k6-final-submit.js';

export const options = {
  scenarios: {
    single_concurrency: {
      executor: 'constant-vus',
      vus: 1,
      duration: __ENV.DURATION || '30s',
    },
  },
};

export default function () {
  runFinalSubmit(__ENV.GROUP || 'scale');
}
