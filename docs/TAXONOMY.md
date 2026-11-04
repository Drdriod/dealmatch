# Place and People taxonomy

Source of truth: the `public.categories` table. The navbar menus, category pages, listing forms,
the Places filter and provider signup all read it. Migration:
`supabase/migrations/20261101000000_taxonomy_v3_merged.sql` (idempotent; refuses to run if a property
or category listing would be left on a retired category).

## Place (5 groups, 21 subcategories)
- **Residential Properties**: Houses for Sale, Houses for Rent, Apartments & Flats, Student Hostels, Co-Living & Shared Apartments
- **Commercial Properties**: Offices, Shops & Retail Spaces, Warehouses, Commercial Buildings, Co-Working Spaces
- **Land & Plots**: Residential Land, Commercial Land, Agricultural Land
- **Hospitality & Accommodation**: Hotels & Boutique Stays, Guest Houses, Serviced Apartments, Short-lets & Vacation Stays
- **Event & Recreation Spaces**: Event Centres, Conference Halls, Outdoor Venues, Recreational Facilities

How a place is offered (rent, short-let, sale, joint venture, off-plan) is NOT a category. It stays on the
listing (`properties.category`, `listing_type`). The Places page no longer has a separate row for it; its filters are the kind-of-place rows, then state.

## People (10 groups, 50 subcategories)
Auto Services, Creativity & Lifestyle, Home & Property Care, Trades & Craftsmen, Licensed Experts,
Professional & Business Services, Logistics & Mobility, Education, Events, Health & Wellness.
(Full list in the migration.)

## How it is wired
- **Listing a place** (`/list`, `/list-rental`): `PlaceSubtypePicker` offers the subcategories that fit the
  listing (`src/lib/placeCategories.js`) and sends `category_id`. Leave it alone and the database files the
  listing by its type. The trigger `fn_set_property_category_id` keeps only an active Place subcategory, so a
  People category or a group can never be filed against a place.
- **Places page** (`/places`): first filter row = Place groups, then their subcategories (`properties.category_id`).
- **Menus and `/category/:slug`**: read the tree; the page lists active properties by `category_id`, and
  verified providers whose category NAME matches.
- **Provider signup** (`/verify-skill`): pick a People group, then a subcategory. The subcategory name is stored
  as the provider's category (the old free-text box is gone); the old provider type (artisan, tutor,
  home_service, other_skill, property_professional) is derived from the group.

## Changing the taxonomy later
Edit the migration's group and leaf lists (or add a new migration), run it on staging, then production.
Existing leaf slugs keep their ids. Never rename a slug that listings already use.
