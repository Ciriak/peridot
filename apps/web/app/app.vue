<template>
  <main>
    <span class="wordmark">peridot</span>
    <h1>Your music.<br />Your space.</h1>
    <p>Your library is waiting.</p>
    <p class="muted">
      The foundation is ready. Music folders, playback, and plugins are coming
      next.
    </p>
  </main>
</template>

<style scoped>
main {
  max-width: 60rem;
  margin: 0 auto;
  padding: 15vh 2rem;
}
.wordmark {
  color: var(--primary);
  font-size: 1.5rem;
  font-weight: 600;
}
h1 {
  font-size: clamp(3rem, 8vw, 6rem);
  letter-spacing: -0.05em;
  line-height: 1.05;
}
p {
  font-size: 1.15rem;
}
.muted {
  color: var(--muted-foreground);
  max-width: 34rem;
  line-height: 1.6;
}
</style>
