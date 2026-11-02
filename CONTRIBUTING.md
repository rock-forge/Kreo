# Contributing to Kreo

Start with the [setup guide](SETUP_GUIDE.md), then read [LICENSE](LICENSE). Source
availability does not grant unrestricted redistribution rights. Public modified
releases require the maintainer's written permission; GitHub's applicable
platform-specific viewing and forking rights remain unaffected.

For a bug report, include the affected command or dashboard page, steps to
reproduce it, expected behavior, actual behavior, and your Node.js version.
Remove bot tokens, OAuth secrets, database credentials, bridge secrets, personal
information, and private server details from logs or screenshots.

For a substantial change, open an issue to discuss it before preparing a pull
request. Only submit code that you are entitled to contribute. Preserve original
author notices and third-party licence requirements. Contributions do not
automatically transfer the contributor's copyright to the project owner.

Install the bot and dashboard dependencies, then run:

    npm test
    npm run lint --prefix dashboard
    npm run build --prefix dashboard

The regression suite uses mocked services and local test servers. It does not
require access to the production bot. The separate check:services script uses
your configured Discord, MongoDB, and Lavalink services; do not run it with
credentials you are not authorized to use.
