# The nightly backup (systems design section 9). Built on the Postgres image, so pg_dump
# always matches the database's version.

FROM rclone/rclone:1.75.2 AS rclone

FROM postgres:18
# rclone is one static binary. The Postgres image has no CA certificates, which rclone
# needs to reach Spaces over HTTPS, so they come from the rclone image too.
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY --from=rclone /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --chmod=755 docker/backup-now.sh /usr/local/bin/backup-now
COPY --chmod=755 docker/backup-nightly.sh /usr/local/bin/backup-nightly
USER postgres
# The Postgres image's entrypoint and stop signal are for a database server, which this
# image doesn't run. On SIGINT, bash would wait out the sleep until 09:00 before stopping.
ENTRYPOINT []
STOPSIGNAL SIGTERM
# To back up once, now: docker compose run --rm backup backup-now
CMD ["backup-nightly"]
