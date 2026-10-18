import { chartProfiles } from './chart-profiles.mjs';
export function compatibilityReport(native, templateIDs = []) {
  return { node_version: process.versions.node, architecture: process.arch, platform: process.platform, node_supported: Number(process.versions.node.split('.')[0]) >= 22,
    native,
    chart_profiles: chartProfiles.map(p => ({ id: p.id, version_verified: native.numbers_version === p.verified_numbers, template_installed: native.automation_tested ? templateIDs.includes(p.template_id) : null, structural_check: 'performed during chart creation' })),
    tested_environment: { numbers: '14.5', macos: '27.0.1', locale: 'Italian', node: '24.19.0', scope: 'one physical Mac; no second-machine compatibility claim' },
    notes: ['Diagnostics do not enable unverified Numbers chart profiles.', 'Native cell editing/prototypes and chart-template availability are separate capabilities.', 'No Accessibility, UI scripting, converter, remote service or extra API key is required.'] };
}
