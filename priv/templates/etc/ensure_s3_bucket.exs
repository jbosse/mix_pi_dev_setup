#!/usr/bin/env elixir

# Development helper script to ensure S3 bucket exists in LocalStack
# Usage: mix run etc/ensure_s3_bucket.exs

bucket_name = System.get_env("S3_BUCKET_NAME") || "uploads"

IO.puts("Checking if S3 bucket '#{bucket_name}' exists...")

case ExAws.S3.head_bucket(bucket_name) |> ExAws.request() do
  {:ok, _} ->
    IO.puts("✓ Bucket '#{bucket_name}' already exists")

  {:error, {:http_error, 404, _}} ->
    IO.puts("Creating bucket '#{bucket_name}'...")

    case ExAws.S3.put_bucket(bucket_name, "") |> ExAws.request() do
      {:ok, _} ->
        IO.puts("✓ Bucket '#{bucket_name}' created")

        # Set CORS configuration
        cors_rules = [
          %{
            allowed_headers: ["*"],
            allowed_methods: ["GET", "POST", "PUT"],
            allowed_origins: ["*"],
            expose_headers: ["ETag"],
            max_age_seconds: 600
          }
        ]

        case ExAws.S3.put_bucket_cors(bucket_name, cors_rules) |> ExAws.request() do
          {:ok, _} ->
            IO.puts("✓ CORS configuration set for bucket '#{bucket_name}'")

          {:error, reason} ->
            IO.puts("⚠ Could not set CORS: #{inspect(reason)}")
        end

      {:error, reason} ->
        IO.puts("✗ Failed to create bucket: #{inspect(reason)}")
        System.halt(1)
    end

  {:error, reason} ->
    IO.puts("✗ Error checking bucket: #{inspect(reason)}")
    IO.puts("Make sure LocalStack is running: docker compose up -d")
    System.halt(1)
end
