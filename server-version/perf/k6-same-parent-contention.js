import { runFinalSubmit } from './k6-final-submit.js';

export const options = {
  scenarios: {
    same_parent_contention: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 12),
      duration: __ENV.DURATION || '30s',
    },
  },
};

export default function () {
  runFinalSubmit(__ENV.GROUP || 'sameParent');
}
