# Java drift example

This repository compiles and ships on Java 17, but its `.java-version` asks for Java 21. `evergreen drift` reports the disagreement and names the exact file and line of each value.

```bash
evergreen drift . --runtime java
evergreen drift . --runtime java --align 21   # print a patch that makes the file agree
```

The patch is printed, never written. Apply it yourself after reviewing it.
