import mongoose, {Schema} from "mongoose";

const sourceSchema = new Schema({
    userId : {
        type : Schema.Types.ObjectId ,
        ref : 'User',
        required : true
    },
    type : {
        type : String,
        enum : ['pdf','csv','link','text','docx']
    },
    title : {
        type : String,
        default : null 
    },
    rawURL : {
        type : String,
        default : null

    },
   

},{
    timestamps : true
})

const Source = mongoose.model('Source', sourceSchema);

export default Source;