import 'dotenv/config'

import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import Source from '../models/source.model.js';
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const COLLECTION_NAME = "notebookLM-Collection";

const qdrantClient = new QdrantClient({
    url: process.env.QUADRANT_URL,
    apiKey: process.env.QUADRANT_API_KEY,
});

// Initialize Qdrant collection and indexes






export const uploadFile = async(req, res)=>{
    try {
         const userId = req.user._id;
        

        if(!userId){
            return res.status(400).json({
                success:false , 
                message :  'Not Authorized'
            })
        }

        const filePath = req.file.path;
       const mime = req.file.mimetype;

        let loader;
        let type;
         if (mime === "application/pdf") {
            loader = new PDFLoader(filePath);
            type = 'pdf'
        } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            loader = new DocxLoader(filePath);
            type = 'docx'
        } else if (mime === "text/plain") {
            loader = new TextLoader(filePath);
            type = 'text'
        } else if (mime === "text/csv") {
            loader = new CSVLoader(filePath, { column: "text" }); 
            type = 'csv'
        
        } else {
            return res.status(400).json({ error: "Unsupported file type" });
        }

        const docs = await loader.load();


        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 600,
            chunkOverlap: 0,
        });

        const chunks = await splitter.splitDocuments(docs);

        const embeddings = new OpenAIEmbeddings({
            model: 'text-embedding-3-large',
        });

         const source = await Source.create({
            userId,
            type ,
        })

        if(!source){
            return res.status(400).json({
                success:false,
                message : 'Unable to create source'
            })
        }

        const documents = chunks.map(chunk => new Document({
            pageContent: chunk.pageContent,
            metadata: {
                userId: userId.toString(),
                sourceId: source._id.toString()
            }
        }));

        const vectorStore = await QdrantVectorStore.fromDocuments(documents , embeddings, {
            url: process.env.QUADRANT_URL,
            apiKey: process.env.QUADRANT_API_KEY,
            collectionName: 'notebookLM-Collection',
        });

        

        const vectorSearcher = vectorStore.asRetriever({
            k : 3,
             filter: {
                must: [
                { key: "metadata.userId", match: { value: userId.toString() } },
                { key: "metadata.sourceId", match: { value: source._id.toString() } },
                ],
            },
        })

        const userQuery = 'Give me the title and summary of the document'

        const relevantChunk = await vectorSearcher.invoke(userQuery);
        const context = relevantChunk.map(chunk => chunk.pageContent).join("\n\n");

         const SYSTEM_PROMPT = `
            You are an AI assistant and an expert summarizer who helps the user give best title and best summary of the document based on the
            context available to you from document given.

            Only ans based on the available context from file only.

            Rule :- 
            - strictly answer only in json format and nothing else, no markdowns only json . 

            Output format :- 
            { title : string , summary : string }

            Context:
            ${JSON.stringify(context)}
        `;

        const response = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userQuery },
            ],
        });

        const rawContent = response.choices[0].message.content;
        const parsedContent = JSON.parse(rawContent);

        source.title = parsedContent?.title ; 
        await source.save();





        return res.status(200).json({
            success: true , 
            source,
            message : "Document processed properly",
            title : parsedContent.title ,
            summary : parsedContent.summary,

        })

        





        
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            success:false,
            message: 'Internal server error while indexing document'
        })

        
    }

}

export const text = async(req, res)=>{
    try {
        const userId = req.user._id;
        const {text} = req.body;

        if(!userId){
            return res.status(400).json({
                success:false , 
                message :  'Not Authorized'
            })
        }

       

        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 600,
            chunkOverlap: 0,
        });

        const texts = await textSplitter.splitText(text);

        

        const embeddings = new OpenAIEmbeddings({
            model: 'text-embedding-3-large',
        });

        

        const source = await Source.create({
            userId,
            type : 'text',
        })

        if(!source){
            return res.status(400).json({
                success:false,
                message : 'Unable to create source'
            })
        }

        const documents = texts.map(chunk => new Document({
            pageContent: chunk,
            metadata: {
                userId: userId.toString(),
                sourceId: source._id.toString()
            }
        }));


        const vectorStore = await QdrantVectorStore.fromDocuments(documents , embeddings, {
            url: process.env.QUADRANT_URL,
            apiKey: process.env.QUADRANT_API_KEY,
            collectionName: 'notebookLM-Collection',
        });

        const vectorSearcher = vectorStore.asRetriever({
            k : 3,
             filter: {
                must: [
                { key: "metadata.userId", match: { value: userId.toString() } },
                { key: "metadata.sourceId", match: { value: source._id.toString() } },
                ],
            },
        })

        

        
        const userQuery = 'Give me the title and summary of the text'

        
        
        
        const relevantChunk = await vectorSearcher.invoke(userQuery);
        const context = relevantChunk.map(chunk => chunk.pageContent).join("\n\n");
        

         const SYSTEM_PROMPT = `
            You are an AI assistant and an expert summarizer who helps the user give best title and best summary of the text based on the
            context available to you from text given.

            Only ans based on the available context from file only.

            Rule :- 
            - strictly answer only in json format and nothing else, no markdowns only json . 

            Output format :- 
            { title : string , summary : string }

            Context:
            ${JSON.stringify(context)}
        `;
       
        

        const response = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userQuery },
            ],
        });


        const rawContent = response.choices[0].message.content;
       
        
        const parsedContent = JSON.parse(rawContent);
        
        
        source.title = parsedContent?.title ; 
        await source.save();





        return res.status(200).json({
            success: true , 
            source,
            message : "Text processed properly",
            title : parsedContent.title ,
            summary : parsedContent.summary,

        })



        
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success:false,
            message: 'Internal server error while indexing text'
        })
        
    }
    
}

export const web = async(req, res)=>{
    try {
        const {url} = req.body;
        const userId = req.user._id ;
        const loader = new PuppeteerWebBaseLoader(url, {
            launchOptions: { headless: true },
            gotoOptions: { waitUntil: "domcontentloaded" }
        });

        const loader2 = new CheerioWebBaseLoader(
        "https://news.ycombinator.com/item?id=34817881",{
              maxConcurrency: 5,
        }
  
        );

        if(!userId){
            return res.status(400).json({
                success:false , 
                message :  'Not Authorized'
            })
        }

        const docs = await loader.load();
        const docs2= await loader2.load();
      

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 600,
            chunkOverlap: 0,
        });

        const chunks = await splitter.splitDocuments(docs);
        const chunks2 = await splitter.splitDocuments(docs2);

        const embeddings = new OpenAIEmbeddings({
            model: 'text-embedding-3-large',
        });

         const source = await Source.create({
            userId,
            type : 'link',
        })

        if(!source){
            return res.status(400).json({
                success:false,
                message : 'Unable to create source'
            })
        }

        const documents = chunks.map(chunk => new Document({
            pageContent: chunk.pageContent,
            metadata: {
                userId: userId.toString(),
                sourceId: source._id.toString()
            }
        }));

        const documents2= chunks2.map(chunk => new Document({
            pageContent: chunk.pageContent,
            metadata: {
                userId: userId.toString(),
                sourceId: source._id.toString()
            }
        }));

        const finalDocs = [...documents,...documents2]


        const vectorStore = await QdrantVectorStore.fromDocuments(finalDocs , embeddings, {
            url: process.env.QUADRANT_URL,
            apiKey: process.env.QUADRANT_API_KEY,
            collectionName: 'notebookLM-Collection',
        });

        await new Promise(resolve => setTimeout(resolve, 500));
       

        const vectorSearcher = vectorStore.asRetriever({
            k : 3,
            filter: {
                must: [
                { key: "metadata.userId", match: { value: userId.toString() } },
                { key: "metadata.sourceId", match: { value: source._id.toString() } },
                ],
            },
        })

        const userQuery = 'Give me the title and summary of the website'

        const relevantChunk = await vectorSearcher.invoke(userQuery);
        const context = relevantChunk.map(chunk => chunk.pageContent).join("\n\n");
         const SYSTEM_PROMPT = `
            You are an AI assistant and an expert summarizer who helps the user give best title and best summary of the website based on the
            context available to you from website given.

            Only ans based on the available context from file only.

            Rule :- 
            - strictly answer only in json format and nothing else, no markdowns only json . 

            Output format :- 
            { title : string , summary : string }

            Context:
            ${JSON.stringify(context)}
        `;

        const response = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userQuery },
            ],
        });

        const rawContent = response.choices[0].message.content;
        const parsedContent = JSON.parse(rawContent);

        source.title = parsedContent?.title ; 
        await source.save();





        return res.status(200).json({
            success: true , 
            source,
            message : "Document processed properly",
            title : parsedContent.title ,
            summary : parsedContent.summary,

        })

        




        
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success:false,
            message:'Internal error while indexing website'
        })
        
        
    }
    
}