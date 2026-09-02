import { runFinalSubmit } from './k6-final-submit.js';

const finalTarget = Number(__ENV.MAX_VUS || 200);
const stages = [1, 10, 25, 50, 100, finalTarget]
  .filter((target, index, values) => target > 0 && values.indexOf(target) === index)
  .map((target) => ({ duration: __ENV.STAGE_DURATION || '15s', target }));
stages.push({ duration: __ENV.DRAIN_DURATION || '15s', target: 0 });

export const options = {
  scenarios: {
    independent_parent_capacity: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages,
      gracefulRampDown: '5s',
    },
  },
};

export default function () {
  runFinalSubmit(__ENV.GROUP || 'scale');
}
