# G2 runtime identity repair-3 failed-run review

The immutable source run is GitHub Actions run `30814159615`, job `91687707916`, on main commit `9511e3e038e3ae29bb446991127c70d423a1b456`. The failed step was `Validate exact image, repaired binding, and pending approval gate`.

The checked-in `failure-artifact.json` is preserved byte-for-byte from the downloaded run artifact. Its SHA-256 is `b48107fd16de3e38af3596db568b61b5e51aee17ded255400014b738b26b32fe`. The old artifact reports `failureStage=initialization` and `failureCode=NOT_STARTED`; those values are retained as evidence of the diagnostic defect and are not reinterpreted as the actual failure location.

The read-only log review identified `REVIEW_PACKET_PATH_LOOKUP_TYPE_ERROR`: an uncaught `TypeError` while reading `providerValidationPath` from the absent `responseContract` property. The committed repair-2 packet stores those paths under `transport`. The exception occurred before the host proxy, provider transport, runtime image preflight, or runtime canary; provider request count was `0`, proxy was `NOT_STARTED`, and runtime canary was `NOT_RUN`.

No API key, credential value, prompt, provider response, or raw exception stack is persisted in this evidence directory. The old workflow run was not rerun.
