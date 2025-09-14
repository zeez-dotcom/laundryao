ALTER TABLE order_prints
  ALTER COLUMN printed_by TYPE uuid USING printed_by::uuid;
ALTER TABLE order_prints
  ADD CONSTRAINT order_prints_printed_by_users_id_fk
  FOREIGN KEY (printed_by) REFERENCES users(id);
