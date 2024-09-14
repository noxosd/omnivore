#!/bin/bash

psql --host $PG_HOST --username $POSTGRES_USER --command "CREATE DATABASE $PG_DB;" || true
echo "create $PG_DB database"

psql --host $PG_HOST --username $POSTGRES_USER --command "CREATE USER app_user WITH ENCRYPTED PASSWORD '$PG_PASSWORD';" || true
echo "created app_user"

psql --host $PG_HOST --username $POSTGRES_USER --command "CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';" || true
echo "created replicator"

psql --host $PG_HOST --username $POSTGRES_USER --command "SELECT pg_create_physical_replication_slot('replication_slot');" || true
echo "created replication_slot"

PG_USER=$POSTGRES_USER PG_PASSWORD=$PGPASSWORD yarn workspace @omnivore/db migrate

psql --host $PG_HOST --username $POSTGRES_USER --dbname $PG_DB --command "GRANT omnivore_user TO app_user;" || true
echo "granted omnivore_user to app_user"

# create demo user with email: demo@omnivore.app, password: demo_password
if [ -z "${NO_DEMO_USER}" ]; then
    USER_ID=$(uuidgen)
    
    new_password=$(LC_ALL=C tr -dc 'A-Za-z0-9!@#$%^&*()-_+=' < /dev/urandom | head -c 12)
    PASSWORD=$(htpasswd -bnBC 10 "" $new_password | tr -d ':\n')
    psql --host $PG_HOST --username $POSTGRES_USER --dbname $PG_DB --command "INSERT INTO omnivore.user (id, source, email, source_user_id, name, password) VALUES ('$USER_ID', 'EMAIL', '$EMAIL', '$EMAIL', '$NAME', '$PASSWORD'); INSERT INTO omnivore.user_profile (user_id, username) VALUES ('$USER_ID', 'demo_user');"
    echo "created user with email: $EMAIL, password: $new_password"
fi
