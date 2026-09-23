import http from 'k6/http'
import { check } from 'k6'

export const options = {
  vus: Number(__ENV.VUS || 4),
  duration: __ENV.DURATION || '20s',
}

export default function () {
  const response = http.get(`${__ENV.BASE_URL}/ready`)
  check(response, { 'ready 200': (result) => result.status === 200 })
}
