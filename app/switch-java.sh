#!/usr/bin/env bash
# Usage: source switch-java.sh <version>
# Example: source switch-java.sh 21

if [ -z "$1" ]; then
    echo "Usage: source switch-java.sh <version>"
    echo ""
    echo "Available JDKs:"
    /usr/libexec/java_home -V 2>&1 | grep -v "^/"
    return 1
fi

_new_java_home=$(/usr/libexec/java_home -v "$1" 2>/dev/null)

if [ -z "$_new_java_home" ]; then
    echo "JDK $1 not found. Run '/usr/libexec/java_home -V' to list available versions."
    return 1
fi

# Remove previous JAVA_HOME/bin from PATH to avoid accumulation
if [ -n "$JAVA_HOME" ]; then
    PATH=$(echo "$PATH" | tr ':' '\n' | grep -v "^${JAVA_HOME}/bin$" | tr '\n' ':' | sed 's/:$//')
fi

export JAVA_HOME="$_new_java_home"
export PATH="$JAVA_HOME/bin:$PATH"
unset _new_java_home

echo "Switched to:"
java -version
