-- Allow pick-list lines to reference quantity-based sundries as well as serialized products.

alter table public.stock_request_lines
  alter column product_id drop not null;

alter table public.stock_request_lines
  add column if not exists sundry_id text references public.stock_sundries(id) on delete restrict;

alter table public.stock_request_lines
  drop constraint if exists stock_request_lines_target_check;

alter table public.stock_request_lines
  add constraint stock_request_lines_target_check
  check (product_id is not null or sundry_id is not null);
