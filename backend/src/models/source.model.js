import mongoose, {Schema} from "mongoose";

const sourceSchema = new Schema({
    userId : {
        type : Schema.Types.ObjectId ,
        ref : 'User',
        required : true
    },
    type : {
        type : String,
        enum : ['pdf','csv','link','text']
    },
    title : {
        type : String,
        required : true
    },
    rawURL : {
        type : String,
        default : null

    },
    filePath : {
        type: String , 
        default : null
    },

},{
    timestamps : true
})

const Source = mongoose.model('Source', sourceSchema);

export default Source;