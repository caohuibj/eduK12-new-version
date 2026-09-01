import { runFinalSubmit } from './k6-final-submit.js';

export const options = {
  scenarios: {
    mixed_final_submit: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || '30s',
    },
  },
};

export default function () {
  runFinalSubmit(__ENV.GROUP || 'mixed');
}
