// The optional combat sandbox never loads the formal game UI or its save repository.
if (new URLSearchParams(window.location.search).get("mode") === "sortie") {
  import("./sortie.js");
} else {
  import("./ui.js");
}
