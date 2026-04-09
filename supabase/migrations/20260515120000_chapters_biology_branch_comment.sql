-- Clarify column semantics after Botany/Zoology subject split (no schema change).
comment on column public.chapters.biology_branch is
  'For Botany or Zoology chapter rows (or legacy combined Biology): botany, zoology, or null when unset / not applicable.';
