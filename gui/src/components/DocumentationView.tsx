import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Book, FileText, ChevronRight } from 'lucide-react';
import { Card, CardContent } from './ui/card';

export function DocumentationView() {
  const [pages, setPages] = useState<{path: string, title: string}[]>([]);
  const [activePage, setActivePage] = useState<string>("index.md");
  const [content, setContent] = useState<string>("# Loading...");
  const [loading, setLoading] = useState<boolean>(true);

  const getApi = () => (window as any).pywebview.api;

  useEffect(() => {
    const fetchPages = async () => {
      try {
        if (getApi()?.get_doc_pages) {
          const fetchedPages = await getApi().get_doc_pages();
          setPages(fetchedPages);
          if (fetchedPages.length > 0 && !fetchedPages.find((p: {path: string, title: string}) => p.path === "index.md")) {
            setActivePage(fetchedPages[0].path);
          }
        }
      } catch (err) {
        console.error("Failed to load doc pages", err);
      }
    };
    fetchPages();
  }, []);

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      try {
        if (getApi()?.get_doc_content) {
          const docContent = await getApi().get_doc_content(activePage);
          setContent(docContent);
        } else {
          setContent("# API Not Available");
        }
      } catch (err) {
        setContent("# Error Loading Document");
      }
      setLoading(false);
    };
    if (activePage) {
      fetchContent();
    }
  }, [activePage]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Docs Sidebar */}
      <div className="w-64 border-r border-zinc-900 bg-zinc-950/40 flex flex-col h-full overflow-y-auto">
        <div className="p-4 border-b border-zinc-900/50 flex items-center space-x-2">
          <Book className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-zinc-200">Documentation</h3>
        </div>
        <div className="p-3 space-y-1">
          {pages.map(page => (
            <button
              key={page.path}
              onClick={() => setActivePage(page.path)}
              className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
                activePage === page.path 
                  ? 'bg-primary/20 text-primary font-medium' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <FileText className={`h-3.5 w-3.5 mr-2 ${activePage === page.path ? 'text-primary' : 'text-zinc-500'}`} />
              <span className="truncate flex-1 text-left">{page.title}</span>
              {activePage === page.path && <ChevronRight className="h-3 w-3 opacity-50" />}
            </button>
          ))}
          {pages.length === 0 && (
            <div className="text-xs text-zinc-500 text-center py-4">No documentation found</div>
          )}
        </div>
      </div>

      {/* Docs Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-zinc-950/20 custom-scrollbar">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-zinc-950/40 border-zinc-900/50">
            <CardContent className="p-8">
              {loading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-8 bg-zinc-900 rounded w-1/3"></div>
                  <div className="h-4 bg-zinc-900 rounded w-full"></div>
                  <div className="h-4 bg-zinc-900 rounded w-5/6"></div>
                  <div className="h-4 bg-zinc-900 rounded w-4/6"></div>
                </div>
              ) : (
                <div className="prose prose-invert prose-zinc max-w-none prose-headings:text-zinc-200 prose-a:text-primary prose-code:text-primary prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                  </ReactMarkdown>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
