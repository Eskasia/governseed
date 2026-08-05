# TASK-OSS-13

Resolving a library entry from top-level build input must not mutate the caller-owned `build.lib` options object. The resolved configuration must still receive the requested entry.
