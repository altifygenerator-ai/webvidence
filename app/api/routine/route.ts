import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { logApiUsage } from '@/lib/data/api-usage';
import { geocodeLocation } from '@/lib/providers/google-places';

const optionalArea = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(240).nullable().optional(),
);

const schema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840),
  timezone: z.string().trim().min(1).max(100).optional(),
  sessionSize: z.number().int().min(1).max(10).default(3),
  reminderEmailEnabled: z.boolean().default(false),
  weeklyRoutineEnabled: z.boolean().default(true),
  prospectingArea: optionalArea,
  prospectingRadiusMiles: z.number().int().min(5).max(100).optional(),
});

const routineSelect = [
  'days_of_week',
  'preferred_time',
  'timezone_offset_minutes',
  'session_size',
  'reminder_email_enabled',
  'weekly_routine_enabled',
  'prospecting_area_location',
  'prospecting_area_center_lat',
  'prospecting_area_center_lng',
  'prospecting_area_radius_miles',
].join(',');

export async function GET() {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db.from('prospecting_routines')
    .select(routineSelect)
    .eq('user_id', user.id)
    .eq('workspace_id', user.workspaceId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ routine: data }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    const db = createAdminClient();
    const now = new Date().toISOString();
    const weekdays = Array.from(new Set(input.daysOfWeek)).sort();
    const requestedArea = input.prospectingArea?.trim() || null;

    const { data: existing } = await db.from('prospecting_routines')
      .select('prospecting_area_location,prospecting_area_center_lat,prospecting_area_center_lng,prospecting_area_radius_miles')
      .eq('user_id', user.id)
      .eq('workspace_id', user.workspaceId)
      .maybeSingle();

    let areaLocation: string | null = existing?.prospecting_area_location || null;
    let areaLat: number | null = typeof existing?.prospecting_area_center_lat === 'number' ? existing.prospecting_area_center_lat : null;
    let areaLng: number | null = typeof existing?.prospecting_area_center_lng === 'number' ? existing.prospecting_area_center_lng : null;
    const areaRadius = input.prospectingRadiusMiles ?? Number(existing?.prospecting_area_radius_miles || 25);

    // Compact post-send routine setup does not send area fields, so it must preserve
    // an area already configured in Settings. A blank area sent explicitly clears it.
    if (input.prospectingArea !== undefined) {
      if (!requestedArea) {
        areaLocation = null;
        areaLat = null;
        areaLng = null;
      } else {
        const sameSavedArea = existing?.prospecting_area_location?.toLocaleLowerCase() === requestedArea.toLocaleLowerCase()
          && typeof existing?.prospecting_area_center_lat === 'number'
          && typeof existing?.prospecting_area_center_lng === 'number';

        if (sameSavedArea) {
          areaLocation = existing.prospecting_area_location;
          areaLat = existing.prospecting_area_center_lat;
          areaLng = existing.prospecting_area_center_lng;
        } else {
          const geocodingKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
          if (!geocodingKey) {
            return NextResponse.json({ error: 'Google geocoding is not configured, so the prospecting area could not be saved.' }, { status: 500 });
          }
          const geocoded = await geocodeLocation(requestedArea, geocodingKey);
          areaLocation = geocoded.formattedAddress.slice(0, 240);
          areaLat = geocoded.coordinates.latitude;
          areaLng = geocoded.coordinates.longitude;
          await logApiUsage({
            workspaceId: user.workspaceId,
            userId: user.id,
            provider: 'google_geocoding',
            operation: 'prospecting_area_geocode',
            units: 1,
            metadata: { requestedArea, formattedAddress: areaLocation },
          }).catch(() => undefined);
        }
      }
    }

    const payload = {
      user_id: user.id,
      workspace_id: user.workspaceId,
      // Keep both the original 009 columns and the 010 compatibility columns in sync.
      days_of_week: weekdays,
      weekdays,
      preferred_time: input.preferredTime,
      timezone_offset_minutes: input.timezoneOffsetMinutes,
      timezone: input.timezone || 'UTC',
      session_size: input.sessionSize,
      reminder_email_enabled: input.reminderEmailEnabled,
      reminder_emails_enabled: input.reminderEmailEnabled,
      weekly_routine_enabled: input.weeklyRoutineEnabled,
      weekly_reminder_enabled: input.weeklyRoutineEnabled,
      prospecting_area_location: areaLocation,
      prospecting_area_center_lat: areaLat,
      prospecting_area_center_lng: areaLng,
      prospecting_area_radius_miles: areaRadius,
      updated_at: now,
    };

    const { data, error } = await db.from('prospecting_routines').upsert(payload, { onConflict: 'user_id' })
      .select(routineSelect)
      .single();
    if (error) throw new Error(error.message);

    await logApiUsage({
      workspaceId: user.workspaceId,
      userId: user.id,
      provider: 'webvidence_event',
      operation: 'routine_set',
      metadata: {
        sessionSize: input.sessionSize,
        reminders: input.reminderEmailEnabled,
        prospectingAreaConfigured: Boolean(areaLocation),
        prospectingRadiusMiles: areaLocation ? areaRadius : null,
      },
    }).catch(() => undefined);

    return NextResponse.json({ routine: data });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid routine settings.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save routine.' }, { status: 500 });
  }
}
