/** Les fichiers .md sont importés comme texte brut (loader `text` dans angular.json). */
declare module '*.md' {
  const content: string;
  export default content;
}
