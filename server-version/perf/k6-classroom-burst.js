import { runFinalSubmit } from './k6-final-submit.js';

const peak = Number(__ENV.BURST_PEAK || 500);

export const options = {
  scenarios: {
    classroom_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1s', target: Math.round(peak * 0.2) },
        { duration: '1s', target: Math.round(peak * 0.5) },
        { duration: '2s', target: peak },
        { duration: '5s', target: peak },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
};

export default function () {
  runFinalSubmit(__ENV.GROUP || 'mixed');
}
