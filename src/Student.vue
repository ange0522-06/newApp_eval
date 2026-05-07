<script>
    export default{
        data(){
            return{
                company_name: "Company group",
                topics : [
                    {name: 'introduction', duration : 5},
                    {name: 'theorie', duration : 15},
                    {name: 'pratique', duration : 65},
                     ]
            }
        }
    }
</script>

<template>
  <h1>Formation vue js - <small>{{ company_name}}</small></h1>
    <ul>
        <li v-for="topic in topics">{{ topic.name }} : {{ topic.duration }}</li>
    </ul>
</template>

<style scoped></style>