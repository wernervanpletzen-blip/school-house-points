# School House Points API

The static frontend remains on GitHub Pages. The API runs as a Node.js
container in the existing Docker Compose stack and connects to its existing
`mariadb` service over the Compose network. Nginx exposes it at
`https://apps.leeuwenhof.co.za/api`; MariaDB does not need another container or
a public database port.

## Initial setup

1. Clone this project on the Docker host in a folder named `school-house-points`
   beside the existing Compose file. If you choose another folder, update the
   API service's build context in `deploy/house-points-api.compose.yml`.
2. Run `sql/school-house-points.sql` as a MariaDB administrator to create the
   app's database and tables. Then create a separate runtime account in
   MariaDB, substituting a unique long password:

   ```sql
   CREATE USER 'school_house_points_app'@'%'
     IDENTIFIED BY 'replace-with-a-long-random-password';
   GRANT SELECT, INSERT, UPDATE, DELETE
     ON school_house_points.* TO 'school_house_points_app'@'%';
   ```

   The `%` host allows the API's changing Docker IP to connect; access is still
   confined to the private Compose network because MariaDB's port is not public.
   Do not use the existing general-purpose `webuser` for this app.
   If you already created the earlier version of the `users` table that
   included a `phone` column, run `sql/remove-users-phone.sql` once as a
   MariaDB administrator. Do this after deploying the API version that no
   longer selects or inserts that column.
   If your app database already exists, run
   `sql/set-house-carryover-points.sql` as a MariaDB administrator to set the
   opening scores to 44 for Eerhof and 34 for Edelhof. The view then adds new
   attendance points on top of those opening totals.
3. Add `deploy/house-points-api.compose.yml` as an additional Compose file:

   ```sh
   docker compose -f /path/to/existing/docker-compose.yml \
     -f /path/to/school-house-points/deploy/house-points-api.compose.yml config
   ```

   Review the rendered config. Compose resolves relative paths against the
   first Compose file, so adjust `context: ./school-house-points` if the clone
   is not located beside that file. The API joins the stack's default network;
   the configured `DB_HOST=mariadb` uses the existing MariaDB service name.
4. Add `HOUSE_POINTS_DB_USER` and `HOUSE_POINTS_DB_PASSWORD` to the existing
   stack `.env` file. Do not put database credentials in Git.
5. In the HTTPS `apps.leeuwenhof.co.za` server block, add the contents of
   `deploy/nginx-house-points-location.conf`. It uses Docker's embedded DNS so
   Nginx can start before the API container is ready, and preserves the `/api`
   prefix in proxied requests.
6. Recreate/reload the stack using both Compose files, then check
   `https://apps.leeuwenhof.co.za/api/health`.
7. Once the service is running, create the first teacher from the project
   folder with the same Compose files:

   ```sh
   docker compose -f /path/to/existing/docker-compose.yml \
     -f /path/to/school-house-points/deploy/house-points-api.compose.yml \
     run --rm --entrypoint npm house-points-api run create-teacher
   ```

The API container listens only on the Docker network; the Compose service does
not publish a host port. Keep the existing MariaDB port private as it is now.
The Node service trusts one reverse proxy hop, so do not add another proxy hop
without adjusting the Express `trust proxy` setting.

The browser sends a short-lived bearer token in the `Authorization` header.
Tokens are stored in session storage, so users sign in again after closing the
browser tab. Public self-registration is limited to learners; teacher accounts
are created from the server.

For local development without Docker, copy `api/.env.example` to `.env`, set
the database connection and frontend origin, run `npm ci`, then `npm start`.
