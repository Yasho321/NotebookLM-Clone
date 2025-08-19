import mongoose, {Schema} from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"], // optional system role too
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    
  },
  { _id: false } // prevent _id for each message
);

const chatSchema = new Schema({
     userId : {
        type : Schema.Types.ObjectId ,
        ref : 'User',
        required : true
    }, 
    sourceId : {
        type : Schema.Types.ObjectId ,
        ref : 'Source',
        required : true
    },
    messages: {
      type: [messageSchema],
      required: true,
      default: [],
    },
},{
    timestamps : true
})

const Chat = mongoose.model('Chat', chatSchema);

export default Chat;