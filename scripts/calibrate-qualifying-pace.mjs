// Compatibility entry point. Controller pace scales were retired.
if (process.argv.includes('--write')) {
  throw new Error('Retired controller-scale writer. Use npm run calibrate:f1-contact -- --write for explicit SIM contact calibration, then npm run validate:f1-course-times.')
}
console.log('Controller scales are retired; running the all-course force/actual-lap audit.')
await import('./validate-f1-course-times.mjs')
