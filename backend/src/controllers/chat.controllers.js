import 'dotenv/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import OpenAI from 'openai';
import { Document } from "@langchain/core/documents";
import Chat from '../models/chat.model.js';
import { QdrantClient } from "@qdrant/js-client-rest";
import { log } from 'util';
import neo4j from 'neo4j-driver'
import User from '../models/user.model.js';

const client = new OpenAI();

const fetchMemory=async(message , userId)=>{
    try {
        const URI = process.env.NEO4J_URI
        const USER = process.env.NEO4J_USERNAME
        const PASSWORD = process.env.NEO4J_PASSWORD
        let driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
        

        let { records, summary } = await driver.executeQuery(
        `
            MATCH (u:User {id: $userId})-[r*1..]-(n)
            RETURN u, r, n
        `,
        {userId: userId.toString()},
        { database: process.env.NEO4J_DATABASE }
        )
        let graphMap="" ;
        // Loop through results
        for (let record of records) {
        const user = record.get('u')
        const rels = record.get('r')
        const nodes = record.get('n')

            graphMap +=`User node: ${JSON.stringify(user.properties)} \n`;
            graphMap += `Connected nodes: ${JSON.stringify(nodes.properties)} \n`
            graphMap += `Relationships: ${rels.map(r => r.type).join(', ')} \n`
            graphMap +=`Available keys: ${record.keys}\n`
        }

        await driver.close()

         const embeddings = new OpenAIEmbeddings({
            model: 'text-embedding-3-large',
        });

        const vectorStore = await QdrantVectorStore.fromExistingCollection(
            embeddings,
            {
            url: process.env.QUADRANT_URL,
            apiKey: process.env.QUADRANT_API_KEY,
            collectionName: 'memory-notebookLM-Collection',
            }
        );

        const vectorSearcher = vectorStore.asRetriever({
            k: 3,
             filter: {
                must: [
                { key: "metadata.userId", match: { value: userId.toString() } },
                ],
            },
            
        });
        
         const relevantChunk = await vectorSearcher.invoke(message);

         let relevantChunkText = "";

         if (!relevantChunk || relevantChunk.length === 0) {
            relevantChunkText="No relevant information found in vector memory.";
        }else {
            relevantChunkText = JSON.stringify(relevantChunk)
        }

        let relevantMaps="";

        

        if(graphMap.trim()===""){
            relevantMaps = "No relevant information and relationships found in graph map."
        }else{
             const relevantMapsPrompt = `
            You are an expert data fetching AI assistant your work is to fetch the relevant maps and relations , connected nodes and Available keys 
            according to the relavent chunks given . 
            Give the most relevant data and filter out all unnecessary stuff . 
            -Do not add any other context in this except the graphmap data 
            -Relevant chunks should be used to cut down the graph map content not to add in it
            - Do not add any context from your side 
            Relavent Chunks :- ${relevantChunkText}
            Whole Graph Map :- ${graphMap} 
         `

         const response = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [{
                role : 'user',
                content : relevantMapsPrompt
            }],
        }); 

         relevantMaps = response.choices[0].message.content ;

        }

        

         const userContext = `
            Relations and informations from graph :- ${relevantMaps}
            Relevant chunks of information about the user :- ${relevantChunkText}
         `

         
        return userContext ;
        
    } catch (error) {
        console.log(error)
        return 'No context as of now'
        
    }
}

const addToMemory = async(message , userId)=>{
    try {
        const {user , assistant} = message;

        const isLongTermPrompt = `
            You are an expert in finding whether the message should be kept in Longterm memory or shortterm memory .
            You will get a message having a double message conversation from user and assistant both your work is to find whether , 
            the conversation have something that should be stored in a long term memory or not , 
            Your response should be a single word either :- 'yes' or 'no'
            Some few shot examples :- 
            - { user : My birthday is on 27th June , assistant : Someone's birthday is coming in a month , Pretty excited for it }
              response :- yes 
            - { user : what's 2x3 , assistant : 6 }
              response :- no
            - { user : Pav Bhaji is my favorite food , assistant : Oh! great , you got a good taste}
              response :- yes 
            - { user : I recently got admission in NIT Raipur , assistant : Congratulations ! hoping for a bright future }
              response :- yes 
            -{ user :  What is polymorphism in OOPS , give answer in short , assistant : Polymorphism is the ability of objects to take on multiple forms, allowing the same method to behave differently depending on the object.}
              response : no 

              You have to give response for the conversation given below 

              Conversation :- {
                user : ${user} ,
                assistant : ${assistant}
              }

              IMPORTANT :- 
              - Response should be a simple yes if it has something that should be stored in Long Term , If nothing in the message should be stored 
                in long term memory than give a simple no as a response 
              - Your response should only be a single word either  yes or no
         `

         const response = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [{
                role : 'user',
                content : isLongTermPrompt
            }],
        }); 

        const isLongTerm = response.choices[0].message.content ;

        

         if(isLongTerm.trim().toLowerCase()=="no"){
            return ;
         }

         const isFactualPrompt = `
            You are an expert in finding whether the message should be kept in Factual longterm memory or Episodic longterm memory .
            You will get a message having a double message conversation from user and assistant both your work is to find whether , 
            the conversation have something that should be stored in a factual long term memory or not , 
            Your response should be a single word either :- 'yes' or 'no'
            Some few shot examples :- 
            - { user : My favorite color is blue , assistant : Got it! Blue is your favorite color. }
              response :- yes 
            - { user : I went trekking in Manali last summer. , assistant : Wow, sounds fun! You went trekking in Manali last summer.How was your Experience }
              response :- no
            - { user : I work at Google as a backend developer , assistant :Okay, so you’re a backend developer at Google , How's work life balance there}
              response :- yes 
            - { user : I have turned into a vegetarian , assistant : Great a step towards kindness and a great culinary choice }
              response :- yes 
            -{ user :  I just read Gunaho ke devta last weekend, and I can't how deeply I am impacted by it emotionally . , assistant : Yeah , It is a book that shakes your inner core makes you feel empty , silent and leaves with a bit of pain.}
              response : no 

              You have to give response for the conversation given below 

              Conversation :- {
                user : ${user} ,
                assistant : ${assistant}
              }

              IMPORTANT :- 
              - Response should be a simple yes if it has something that should be stored in Factual Long Term , If nothing in the message should be stored 
                in Factual long term memory than give a simple no as a response 
              - Your response should only be a single word either  yes or no

         `

         const response2 = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [{
                role : 'user',
                content : isFactualPrompt
            }],
        }); 

         const isFactual = response2.choices[0].message.content ;
        
         if(isFactual =="yes"){
            const factsPrompt = `
                You are an expert data retriever , you retrieve all the important data in as much small sentence possible cutting of all the unnecessary grammer and language 
                just the data that's needed . 
                Now you have to retrieve the factual long term memory data from a  double message conversation from user and assistant . The data should 
                be precise and accurate. 
                Caution :- 
                - Do not add anything of your own 
                - Output should be a string having the factual data 

                Some few shot examples :- 
                - { user : My favorite color is blue , assistant : Got it! Blue is your favorite color. }
                  response :- User's favorite color blue
                - { user : I work at Google as a backend developer , assistant :Okay, so you’re a backend developer at Google , How's work life balance there}
                  response :- User backend developer at google
                - { user : I have turned into a vegetarian , assistant : Great a step towards kindness and a great culinary choice }
                  response :- user turned veg

                You have to give response for the conversation given below 

                Conversation :- {
                    user : ${user} ,
                    assistant : ${assistant}
                }
                
                Caution :- 
                - Do not add anything of your own 
                - Output should be a string having the factual data 
                 
                
            `

            const response = await client.chat.completions.create({
                model: 'gpt-4.1-mini',
                messages: [{
                    role : 'user',
                    content : factsPrompt
                }],
            }); 

            const fact = response.choices[0].message.content ;
            const userdb = await User.findByIdAndUpdate(userId, {
                $push : {facts : fact}
            },{
                new : true , upsert : true 
            })

            

            return

         }else {
            const URI = process.env.NEO4J_URI
            const USER = process.env.NEO4J_USERNAME
            const PASSWORD = process.env.NEO4J_PASSWORD
            let driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
            let { records, summary } = await driver.executeQuery(
            `
               MERGE (u:User {id: $userId})
               WITH u
               OPTIONAL MATCH (u)-[r*1..]-(n)
               RETURN u, r, n

            `,
            {userId: userId.toString()},
            { database: process.env.NEO4J_DATABASE }
            )
            let graphMap="" ;
            // Loop through results
            for (let record of records) {
            const user = record.get('u')
            const rels = record.get('r')
            const nodes = record.get('n')

                if (user) {
                    graphMap += `User node: ${JSON.stringify(user.properties)} \n`;
                }

                if (nodes) {
                    graphMap += `Connected nodes: ${JSON.stringify(nodes.properties)} \n`;
                }

                if (rels && rels.length > 0) {
                    graphMap += `Relationships: ${rels.map(r => r.type).join(', ')} \n`;
                }

                graphMap += `Available keys: ${record.keys}\n`;
            }

           


            const epsPrompt1 = `
                You are an AI assistant expert in fetching the episodic long term memory and  writing  Cypher queries for the same in neo4j graph db , write cypher queries to create the relations 
                among the data which can be retrieved later as a episodic long term memory . Write as such that it will create a node if it didn't already exist 
                Already present relation of the user :- 
                ${graphMap} 

                User node should be something like :- User {id: $userId}

                Some few shot examples :- 
                - { user : I went trekking in Manali last summer. , assistant : Wow, sounds fun! You went trekking in Manali last summer. }
                response :- MERGE (u:User {id: $userId})  // create user if not exists
                            MERGE (place:Place {name: 'Manali'}) // create place if not exists
                            MERGE (u)-[r:traveledTo]->(place) 
                            ON CREATE SET r.event = 'Trekking', r.season = 'Summer'
                            RETURN u, place, r

                - { user : I watched Interstellar last weekend, and it blew my mind. , assistant : Got it! You watched Interstellar last weekend. }
                response :- MERGE (u:User {id: $userId})
                            MERGE (m:Movie {title: 'Interstellar'})
                            MERGE (u)-[r:watchedMovie]->(m)
                            RETURN u, m, r

                - { user : I tried baking a chocolate cake yesterday, and it turned out great., assistant : Nice! You baked a chocolate cake yesterday.}
                response :- MERGE (u:User {id: $userId})
                            MERGE (dish:Dish {name: 'Chocolate Cake'})
                            MERGE (u)-[r:cooked]->(dish)
                            RETURN u, dish, r

                Now make cypher query of the episodic memory of the given conversation keeping in mind already present relations in the graph :-
                Conversation :- {
                    user : ${user} , 
                    assistant : ${assistant}
                }

                IMPORTANT :- 
                - Only give query there should be no wrapper text around it 
                - There should nothing in the response except query , no mark down , no extra punctuation "forward slash n" for new line , nothing 
                  only and only cypher query

            `
            const response = await client.chat.completions.create({
                model: 'gpt-4.1-mini',
                messages: [{
                    role : 'user',
                    content : epsPrompt1
                }],
            }); 

            const cypherQuery = response.choices[0].message.content ;

            const cypherRes = await driver.executeQuery(
                cypherQuery
            ,
            {userId: userId.toString()},
            { database: process.env.NEO4J_DATABASE_NAME }
            )

           

            await driver.close()

            const epsPrompt2 = `
                You are an AI assistant expert in fetching the episodic long term memory and  giving the important information with all the noises cut down so that it can 
                be stored in a vector DB sementically .
                
                Some of the few short examples :- 
                - { user : I went trekking in Manali last summer. , assistant : Wow, sounds fun! You went trekking in Manali last summer. }
                response :- User traveled to Manali for trekking last summer.
                - { user : I watched Interstellar last weekend, and it blew my mind. , assistant : Got it! You watched Interstellar last weekend. }
                response :- User watched the movie Interstellar last weekend.
                - { user : I tried baking a chocolate cake yesterday, and it turned out great., assistant : Nice! You baked a chocolate cake yesterday.}
                response :- User baked a chocolate cake yesterday.

                Here is the conversation for which you have to give a response :- 
                Conversation :- {
                    user : ${user} , 
                    assistant : ${assistant}
                }

                IMPORTANT :- 
                - Only give response which needs to go in the vector db , no noise or wrapper text  

            `
             const response2 = await client.chat.completions.create({
                model: 'gpt-4.1-mini',
                messages: [{
                    role : 'user',
                    content : epsPrompt2
                }],
            }); 

            const indexingContent = response2.choices[0].message.content ;

            const embeddings = new OpenAIEmbeddings({
                 model: 'text-embedding-3-large',
            });

            const documents =[new Document({
                pageContent: indexingContent,
                metadata: {
                    userId: userId.toString(),
                   
                }
            })]

            const vectorStore = await QdrantVectorStore.fromDocuments(documents , embeddings, {
                        url: process.env.QUADRANT_URL,
                        apiKey: process.env.QUADRANT_API_KEY,
                        collectionName: 'memory-notebookLM-Collection',
                    });

            

            return 



         }









        
    } catch (error) {
        console.log(error)
        return 
        
    }
}

export const createMessage = async (req,res)=>{
    try {
        
        const userId = req.user._id;
        const {sourceId} = req.params;
        const {message} = req.body;

        const userContext = await fetchMemory(message , userId);
        
        const user = await User.findById(userId);

        const facts = user.facts ; 
        let factsText = ""; 
        if(!facts || facts.length ==0){
            factsText = "Nothing as of now"
        }else { 
            factsText = JSON.stringify(facts)
        }



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

         const rewrittingQuery = `
        You are an expert query writter. Fix all the typo's and add more context 
        to the wuery so it can fetch more relevant data.
        Output should be a single string having query
        for example : 'What is asynchronous function'

        user query :- ${message}
         `
         

        const response = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [{
                role : 'user',
                content : rewrittingQuery
            }],
        }); 

         const refinedQuery = response.choices[0].message.content ;

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

        const relevantChunk = await vectorSearcher.invoke(refinedQuery);

        const gettingBetterChunksPrompt = `
            You are an expert query writer. Your work is to check the quality of relevant chunks and to find the least relevant chunk. 
            and you have to optimize the prompt such that quality of chunks improve according to the query . The query should be same as 
            the original user's query so that user get's the most accurate answer . 
            Output should be a single string that will be the optimized query . 
            for example :- 'What is asynchronous functions in javascript'
            user's orignial query :- ${message}
            user's query with fixed typo and more context :- ${refinedQuery}
            relavent chunks fetched :- ${relevantChunk}
        `
         const response3 = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [{
                role : 'user',
                content : gettingBetterChunksPrompt
            }],
        }); 

         const refinedQuery2 = response3.choices[0].message.content ;

         

        const relevantChunk2 = await vectorSearcher.invoke(refinedQuery2);
       


         const allChunks = [...relevantChunk,...relevantChunk2  ];

         const freqMap = new Map();

         allChunks.forEach((chunk, index)=>{
            const key = JSON.stringify(chunk)
            if(!freqMap.has(key)){
                freqMap.set(key , { count : 1 ,firstIndex : index})
            }else{
                freqMap.get(key).count++;
            }
         })

         const sortedChunks = [...freqMap.entries()].sort((a,b)=>{
            const [chunkA , dataA] = a;
            const [chunkB , dataB] = b ;
            if(dataB.count !== dataA.count){
                return dataB.count - dataA.count;
            }

            return dataA.firstIndex - dataB.firstIndex;
         })

         const priorityChunks = sortedChunks.slice(0,3).map(([chunk])=>JSON.parse(chunk));


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

            Factual context about user :- 
            ${factsText}

            Episodic context about user :- 
            ${userContext}

            Context on source provided:
            ${JSON.stringify(priorityChunks)}

            - Context about user is just to give answers on questions about user and to give a personalize touch to the answers given 
              do not use it as a context to answer any user query . 
            - context about user should give personalized touch to the user 
            - Answer to the queries should be provided by the context on source , and not the user context 

            IMPORTANT :- 
            - I repeat do not answer anything whose context is not provided even if you have knowledge about it, 
            

            


        `
        const systemMessage = {
            role: "system",
            content: SYSTEM_PROMPT
        };

        const finalMessages = [systemMessage, ...messages];

        const response2 = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: finalMessages,
        }); 

        const refinedRes = response2.choices[0].message.content ; 
        messages.push({
            role : 'assistant',
            content : refinedRes
        })

        await addToMemory({
            user : message , 
            assistant : refinedRes,
        },userId)

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