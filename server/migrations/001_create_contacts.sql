CREATE TABLE contacts (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contacts_message_length CHECK (char_length(message) BETWEEN 5 AND 5000)
);

CREATE INDEX contacts_created_at_idx ON contacts (created_at DESC);
