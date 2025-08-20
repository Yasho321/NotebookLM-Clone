import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Link, Upload, Loader2 } from "lucide-react";
import { useSourceStore } from '../stores/sourceStore';
import toast from 'react-hot-toast';

export default function SourcePanel() {
  const { sources, selectedSource, isUploading, addTextSource, addFileSource, addUrlSource, selectSource } = useSourceStore();
  const [textInput, setTextInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [file, setFile] = useState(null);

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    
    const result = await addTextSource(textInput);
    if (result.success) {
      setTextInput('');
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) return;
    
    const result = await addUrlSource(urlInput);
    if (result.success) {
      setUrlInput('');
    }
  };

  const handleFileSubmit = async () => {
    if (!file) return;
    
    const result = await addFileSource(file);
    if (result.success) {
      setFile(null);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Check file type
      const allowedTypes = ['.pdf', '.docx', '.csv', '.txt'];
      const fileExtension = '.' + selectedFile.name.split('.').pop().toLowerCase();
      
      if (allowedTypes.includes(fileExtension)) {
        setFile(selectedFile);
      } else {
        toast.error('Please upload PDF, DOCX, CSV, or TXT files only');
        e.target.value = '';
      }
    }
  };

  return (
    <div className="w-80 bg-source-bg border-r border-border h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground mb-4">Sources</h2>
        
        {/* Add Source Tabs */}
        <Tabs defaultValue="text" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted">
            <TabsTrigger value="text" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              Text
            </TabsTrigger>
            <TabsTrigger value="upload" className="text-xs">
              <Upload className="w-3 h-3 mr-1" />
              File
            </TabsTrigger>
            <TabsTrigger value="url" className="text-xs">
              <Link className="w-3 h-3 mr-1" />
              URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-3 mt-4">
                       <div className="flex flex-col h-[200px]">
              <Textarea
                placeholder="Paste your text here..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="flex-1 bg-input border-border resize-none overflow-y-auto"
              />
              <Button
                onClick={handleTextSubmit}
                disabled={!textInput.trim() || isUploading}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mt-3"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Text
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-3 mt-4">
             <div className="border-2 border-dashed border-border rounded-lg p-4 text-center bg-muted/20 hover:bg-muted/40 transition-colors">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.docx,.csv,.txt"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {file ? file.name : "Click to upload file"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, DOCX, CSV, TXT
                </p>
              </label>
            </div>
            <Button
              onClick={handleFileSubmit}
              disabled={!file || isUploading}
               className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Upload File
            </Button>
          </TabsContent>

          <TabsContent value="url" className="space-y-3 mt-4">
            <Input
              placeholder="https://example.com"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="bg-input border-border"
            />
            <Button
              onClick={handleUrlSubmit}
              disabled={!urlInput.trim() || isUploading}
             className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add URL
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Saved Sources ({sources.length})
        </h3>
        <div className="space-y-2">
          {sources.map((source) => (
            <Card
              key={source._id}
              className={`p-3 cursor-pointer transition-all hover:bg-source-hover ${
                selectedSource?._id === source._id 
                  ? 'bg-accent border-ring' 
                  : 'bg-source-item border-border'
              }`}
              onClick={() => selectSource(source)}
            >
              <div className="flex items-start space-x-2">
                <div className="flex-shrink-0 mt-1">
                  {source.type === 'text' && <FileText className="w-4 h-4 text-muted-foreground" />}
                  {source.type === 'pdf' && <FileText className="w-4 h-4 text-muted-foreground" />}
                  {source.type === 'link' && <Link className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {source.title || `${source.type} source`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(source.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
          {sources.length === 0 && (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                No sources yet. Add your first source above.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}