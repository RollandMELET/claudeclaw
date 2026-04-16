/**
 * ccos-foundation — Phase 0 of the claudeclaw-os cherry-pick plan.
 *
 * No-op migration. The actual schema changes are applied at boot via
 * `CREATE TABLE IF NOT EXISTS` in src/db.ts (`createSchema` function):
 *
 *   - meet_sessions
 *   - warroom_meetings
 *   - warroom_transcript
 *   - skill_health
 *   - skill_usage
 *
 * This file exists only to satisfy the migration registry
 * (migrations/version.json) so the startup guard in checkPendingMigrations()
 * can record v1.1.0 as applied.
 *
 * Future ALTER TABLE / ADD COLUMN changes on these tables MUST be done via
 * a proper migration file here (not inline in db.ts), because
 * CREATE TABLE IF NOT EXISTS silently ignores schema drift on existing
 * tables.
 */

export const description = 'ccos phase 0 foundation (tables created at boot via createSchema)';

export async function run(): Promise<void> {
  // Intentionally empty — see file header.
}
