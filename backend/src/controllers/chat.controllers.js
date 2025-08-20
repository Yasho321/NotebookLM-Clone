import 'dotenv/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import OpenAI from 'openai';
import Chat from '../models/chat.model.js';
import { QdrantClient } from "@qdrant/js-client-rest";
import { log } from 'util';

const client = new OpenAI();
const qdrantClient = new QdrantClient({
    url: process.env.QUADRANT_URL,
    apiKey: process.env.QUADRANT_API_KEY,
});

async function createIndexes() {
  await  qdrantClient.createPayloadIndex("notebookLM-Collection", {
    field_name: "metadata.userId",
    field_schema: "keyword"
  });

  await  qdrantClient.createPayloadIndex("notebookLM-Collection", {
    field_name: "metadata.sourceId",
    field_schema: "keyword"
  });

  console.log("Indexes created successfully ✅");
}

export const createMessage = async (req,res)=>{
    try {
        const userId = req.user._id;
        const {sourceId} = req.params;
        const {message} = req.body;
        
        if(!userId){
            return res.status(400).json({
                success : false ,
                message : 'Not Authorized'
            })
        }

        if(!sourceId || !message){
            return res.status(400).json({
                success : false ,
                message : 'No sourceId or message'
            })
        }

        const embeddings = new OpenAIEmbeddings({
            model: 'text-embedding-3-large',
        });

        const vectorStore = await QdrantVectorStore.fromExistingCollection(
            embeddings,
            {
            url: process.env.QUADRANT_URL,
            apiKey: process.env.QUADRANT_API_KEY,
            collectionName: 'notebookLM-Collection',
            }
        );

        const vectorSearcher = vectorStore.asRetriever({
            k: 3,
             filter: {
                must: [
                { key: "metadata.userId", match: { value: userId.toString() } },
                { key: "metadata.sourceId", match: { value: sourceId.toString() } },
                ],
            },
            
        });

        const relevantChunk = await vectorSearcher.invoke(message);

        let chat = await Chat.findOne({
            userId,
            sourceId
        });

        if(!chat){
            chat= await Chat.create({
                userId,
                sourceId
            })
        }

        let messages = chat.messages || [];

        messages.push({
            role: 'user',
            content : message
        })


        const SYSTEM_PROMPT = `
             You are an AI assistant who helps resolving user query based on the
            context available to you , context can be from text , pdf file , docx file , csv file , text file , url (web) .

            Only ans based on the available context only.

            give sources as well if web give relevant url's 

            Context:
            ${JSON.stringify(relevantChunk)}

        `
        const systemMessage = {
            role: "system",
            content: SYSTEM_PROMPT
        };

        const finalMessages = [systemMessage, ...messages];

        const response = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: finalMessages,
        }); 

        const refinedRes = response.choices[0].message.content ; 
        messages.push({
            role : 'assistant',
            content : refinedRes
        })

        chat.messages = messages;
        await chat.save();

        return res.status(200).json({
            success: true , 
            message : 'Received response successfully',
            response: refinedRes , 
            messages ,
            chat

        })



        
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            success: false,
            message: 'Internal error while chatting'
        })
        
    }
}

export const getChats = async (req,res)=>{
    try {
         const userId = req.user._id;
        const {sourceId} = req.params;
         if(!userId){
            return res.status(400).json({
                success : false ,
                message : 'Not Authorized'
            })
        }

        if(!sourceId ){
            return res.status(400).json({
                success : false ,
                message : 'No sourceId '
            })
        }

        const chats = await Chat.find({
            userId,
            sourceId
        });
        if(!chats){
            return res.status(200).json({
                success: true , 
                chats,
                message : "No message in chat"
            })
        }

         return res.status(200).json({
                success: true , 
                chats,
                message : "Messages fetched"
            })


        
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success:false ,
            message : "Internal error while fetching chats"
        })
        
        
    }
}