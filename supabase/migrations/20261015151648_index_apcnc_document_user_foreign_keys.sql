create index apcnc_document_store_updated_by_idx
  on public.apcnc_document_store (updated_by)
  where updated_by is not null;

create index apcnc_document_audit_changed_by_idx
  on public.apcnc_document_audit (changed_by)
  where changed_by is not null;
