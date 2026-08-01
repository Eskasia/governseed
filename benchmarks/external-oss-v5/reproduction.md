# V5 reproduction

From the GovernSeed repository root, run:

    node benchmarks/external-oss-v5/tests/schema-validation.mjs
    node benchmarks/external-oss-v5/tests/seed-contract-validation.mjs
    node benchmarks/external-oss-v5/tests/dependency-cache-workflow-validation.mjs
    ruby -e 'require "yaml"; YAML.load_file(".github/workflows/external-oss-v5-dependency-cache.yml"); puts "YAML_PASS"'

The upstream identity audit and two independent reconstructions were performed
in isolated temporary repositories using exact upstream commit fetches. The
sealed seed commit values in each task contract are local deterministic
reconstructions; they are not upstream fetch targets.

Do not dispatch the V5 workflow, provide credentials, run Codex, or start a
Pilot from this seed-identity phase. Those actions require a new phase gate and
new evidence.
