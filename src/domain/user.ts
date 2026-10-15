// A user holds nothing else in the domain model (section 3.1). The ID is Supabase's
// UUID for the user (technical spec 7.1).
export interface User {
  readonly id: string;
}
