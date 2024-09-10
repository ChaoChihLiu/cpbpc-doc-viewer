#!/bin/bash

PID=$(lsof -i :3000 | awk 'NR > 1 {print $2}')

# Check if PID is found
if [ -n "$PID" ]; then
    echo "Killing process with PID: $PID"
    kill -9 $PID
else
    echo "No process found for lsof -i :3000"
fi
