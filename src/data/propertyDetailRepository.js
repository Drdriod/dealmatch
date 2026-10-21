// Repository (structural pattern) for the property detail page (PropertyPage).
// The server's propertyRepository is a different file: it takes a client as an argument.
import { supabase } from '@/lib/supabase'

// The seller's contact details. The database answers only for the owner, staff, or a party
// to a funded escrow deal on this property (get_property_contact), so never join this in the client.
export function fetchPropertyContact(propertyId) {
  return supabase.rpc('get_property_contact', { p_property_id: propertyId })
}
