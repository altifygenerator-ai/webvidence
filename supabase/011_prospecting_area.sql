-- WEBVIDENCE 011: PROSPECTING AREA
-- Adds an optional geographic guardrail for automatic Today sessions and watched-market refreshes.
-- Manual searches remain unrestricted and continue using the location entered on the Find screen.

begin;

alter table public.prospecting_routines
  add column if not exists prospecting_area_location text,
  add column if not exists prospecting_area_center_lat double precision,
  add column if not exists prospecting_area_center_lng double precision,
  add column if not exists prospecting_area_radius_miles smallint not null default 25;

alter table public.prospecting_routines
  drop constraint if exists prospecting_routines_area_location_length_check,
  drop constraint if exists prospecting_routines_area_lat_check,
  drop constraint if exists prospecting_routines_area_lng_check,
  drop constraint if exists prospecting_routines_area_radius_check,
  drop constraint if exists prospecting_routines_area_coordinates_check;

alter table public.prospecting_routines
  add constraint prospecting_routines_area_location_length_check
    check (prospecting_area_location is null or char_length(prospecting_area_location) <= 240),
  add constraint prospecting_routines_area_lat_check
    check (prospecting_area_center_lat is null or prospecting_area_center_lat between -90 and 90),
  add constraint prospecting_routines_area_lng_check
    check (prospecting_area_center_lng is null or prospecting_area_center_lng between -180 and 180),
  add constraint prospecting_routines_area_radius_check
    check (prospecting_area_radius_miles between 5 and 100),
  add constraint prospecting_routines_area_coordinates_check
    check (
      (prospecting_area_location is null and prospecting_area_center_lat is null and prospecting_area_center_lng is null)
      or
      (prospecting_area_location is not null and prospecting_area_center_lat is not null and prospecting_area_center_lng is not null)
    );

comment on column public.prospecting_routines.prospecting_area_location is
  'Normalized display location used to constrain automatic sessions and watched-market refreshes. Manual searches are not constrained.';
comment on column public.prospecting_routines.prospecting_area_radius_miles is
  'Radius around the saved prospecting-area coordinates used for automatic prospect selection and watched-market refreshes.';

-- Refresh PostgREST/Supabase schema cache after adding the columns.
notify pgrst, 'reload schema';

commit;
